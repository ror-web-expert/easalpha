import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { scannerConfig, type ScannerConfig } from "@/lib/barcode";
import { CameraScanDialog, useBarcodeScanner } from "./scanner";

const zxing = vi.hoisted(() => ({ decodeFromStream: vi.fn() }));
vi.mock("@zxing/browser", () => ({ BrowserMultiFormatReader: class { decodeFromStream = zxing.decodeFromStream; } }));

const CODE = "8964000123456";
const config = (over: Partial<ScannerConfig> = {}): ScannerConfig => ({ ...scannerConfig({ "pos.barcode_scanning.enabled": true }), ...over });

/** The till's item search with the keyboard-wedge scanner listening. */
function Till({ config, onScan, onEnter }: { config: ScannerConfig; onScan: (code: string) => void; onEnter: () => void }) {
  useBarcodeScanner({ config, enabled: true, onScan });
  return <input data-scan-target aria-label="Search items" onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }} />;
}

function setup(over: Partial<ScannerConfig> = {}) {
  const onScan = vi.fn();
  const onEnter = vi.fn();
  render(<Till config={config(over)} onScan={onScan} onEnter={onEnter} />);
  const box = screen.getByLabelText("Search items") as HTMLInputElement;
  box.focus();
  return { onScan, onEnter, box };
}

/** One key as a browser sends it: keydown, then the character goes into the field unless the keydown was swallowed. False when swallowed. */
function press(el: HTMLInputElement, key: string): boolean {
  const ok = fireEvent.keyDown(el, { key });
  if (ok && [...key].length === 1) fireEvent.input(el, { target: { value: el.value + key } });
  return ok;
}
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Characters at scanner speed, 10 ms apart. */
function typeFast(el: HTMLInputElement, text: string) {
  for (const key of text) { press(el, key); wait(10); }
}

function openModal() {
  const modal = document.createElement("div");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  document.body.appendChild(modal);
  return modal;
}

describe("useBarcodeScanner", () => {
  // The hook times keys with performance.now() (jsdom's event timeStamp is epoch time), so that clock is faked too.
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }); });
  afterEach(() => { vi.useRealTimers(); document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove()); });

  it("takes a fast burst ending in Enter, clears the item search and swallows the Enter", () => {
    const { onScan, onEnter, box } = setup();
    typeFast(box, CODE);
    expect(press(box, "Enter")).toBe(false);
    expect(onScan).toHaveBeenCalledWith(CODE);
    expect(box.value).toBe("");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("stands aside while a dialog or sheet is open: the keys stay with it and nothing is added", () => {
    const { onScan, onEnter, box } = setup();
    const modal = openModal();
    typeFast(box, CODE);
    expect(press(box, "Enter")).toBe(true);
    wait(500);
    expect(onScan).not.toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(box.value).toBe(CODE);
    // Closed again: scanning works as before.
    modal.remove();
    fireEvent.input(box, { target: { value: "" } });
    typeFast(box, CODE);
    expect(press(box, "Enter")).toBe(false);
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("drops a burst when a dialog opens before the pause that would end it", () => {
    const { onScan, box } = setup({ terminator: "none" });
    typeFast(box, CODE);
    openModal();
    wait(200);
    expect(onScan).not.toHaveBeenCalled();
  });

  it("swallows a late Enter after a code the pause already ended (terminator none), so the search does not add its first tile", () => {
    const { onScan, onEnter, box } = setup({ terminator: "none" });
    typeFast(box, CODE);
    wait(80); // past the key interval + 20 ms: the pause ends the scan
    expect(onScan).toHaveBeenCalledWith(CODE);
    expect(box.value).toBe("");
    expect(press(box, "Enter")).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("swallows an Enter that comes after the key interval but before the pause is noticed", () => {
    const { onScan, onEnter, box } = setup({ terminator: "none" });
    typeFast(box, CODE);
    wait(50); // 60 ms after the last key: slower than the 50 ms interval, before the 70 ms flush
    expect(onScan).not.toHaveBeenCalled();
    expect(press(box, "Enter")).toBe(false);
    expect(onScan).toHaveBeenCalledWith(CODE);
    expect(onEnter).not.toHaveBeenCalled();
    expect(box.value).toBe("");
  });

  it("lets a person's Enter through: after typing something, or once the moment has passed", () => {
    const { onScan, onEnter, box } = setup();
    typeFast(box, CODE);
    press(box, "Enter");
    wait(400);
    expect(press(box, "Enter")).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    typeFast(box, CODE);
    press(box, "Enter");
    press(box, "a");
    expect(press(box, "Enter")).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenCalledTimes(2);
  });
});

describe("CameraScanDialog", () => {
  const stream = { getTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
  const readyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState");
  let made: { formats?: string[] }[] = [];

  /** window.BarcodeDetector reporting these formats, with this detect(). */
  function nativeDetector(formats: string[], detect: () => Promise<{ rawValue: string }[]>) {
    const detectMock = vi.fn(detect);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => formats;
      detect = detectMock;
      constructor(opts: { formats?: string[] }) { made.push(opts); }
    };
    return detectMock;
  }

  beforeEach(() => {
    made = [];
    zxing.decodeFromStream.mockReset().mockResolvedValue({ stop: vi.fn() });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (readyState) Object.defineProperty(HTMLMediaElement.prototype, "readyState", readyState);
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("uses ZXing when the browser's BarcodeDetector reports no formats", async () => {
    const detect = nativeDetector([], async () => []);
    render(<CameraScanDialog open onClose={vi.fn()} onCode={vi.fn()} />);
    await waitFor(() => expect(zxing.decodeFromStream).toHaveBeenCalledTimes(1));
    expect(zxing.decodeFromStream.mock.calls[0][0]).toBe(stream);
    expect(made).toEqual([]);
    expect(detect).not.toHaveBeenCalled();
  });

  it("switches to ZXing when detect() keeps failing", async () => {
    const detect = nativeDetector(["qr_code", "ean_13", "aztec"], async () => { throw new Error("Barcode detection service unavailable."); });
    render(<CameraScanDialog open onClose={vi.fn()} onCode={vi.fn()} />);
    await waitFor(() => expect(zxing.decodeFromStream).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(made).toEqual([{ formats: ["ean_13", "qr_code"] }]);
    expect(detect).toHaveBeenCalledTimes(3);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(detect).toHaveBeenCalledTimes(3);
  });

  it("reads codes with a working BarcodeDetector and never loads ZXing", async () => {
    let calls = 0;
    nativeDetector(["ean_13"], async () => (++calls < 2 ? [] : [{ rawValue: ` ${CODE} ` }]));
    const onCode = vi.fn();
    const onClose = vi.fn();
    render(<CameraScanDialog open onClose={onClose} onCode={onCode} />);
    await waitFor(() => expect(onCode).toHaveBeenCalledWith(CODE));
    expect(onClose).toHaveBeenCalled();
    expect(zxing.decodeFromStream).not.toHaveBeenCalled();
  });
});
