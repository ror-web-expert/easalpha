// Optional USB transport. The `usb` native module is loaded lazily; if it is not
// installed or failed to compile we report "USB support not installed" instead
// of breaking the app.

type UsbModule = {
  findByIds?: (vid: number, pid: number) => UsbDevice | undefined;
  getDeviceList?: () => UsbDevice[];
};
type UsbDevice = {
  open(): void;
  close(): void;
  deviceDescriptor: { idVendor: number; idProduct: number };
  interfaces: UsbInterface[];
};
type UsbInterface = {
  isKernelDriverActive(): boolean;
  detachKernelDriver(): void;
  attachKernelDriver(): void;
  claim(): void;
  release(cb: (err?: Error) => void): void;
  endpoints: UsbEndpoint[];
};
type UsbEndpoint = { direction: "in" | "out"; transfer(data: Buffer, cb: (err?: Error) => void): void };

let usbModule: UsbModule | null | undefined;

function loadUsb(): UsbModule | null {
  if (usbModule !== undefined) return usbModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("usb") as UsbModule & { usb?: UsbModule };
    usbModule = (mod.usb ?? mod) as UsbModule;
  } catch {
    usbModule = null;
  }
  return usbModule;
}

export function usbAvailable(): boolean {
  return loadUsb() !== null;
}

export function sendToUsbPrinter(vendorId: number | undefined, productId: number | undefined, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const usb = loadUsb();
    if (!usb || typeof usb.findByIds !== "function") {
      return reject(new Error("USB support not installed. Use a network or system printer, or install the optional usb module."));
    }
    if (!vendorId || !productId) return reject(new Error("USB printer needs a vendor ID and product ID"));
    const device = usb.findByIds(vendorId, productId);
    if (!device) return reject(new Error(`USB printer ${vendorId.toString(16)}:${productId.toString(16)} not connected`));
    let iface: UsbInterface | undefined;
    let detached = false;
    try {
      device.open();
      iface = device.interfaces.find((i) => i.endpoints.some((e) => e.direction === "out"));
      if (!iface) throw new Error("USB printer has no output endpoint");
      if (process.platform !== "win32" && iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
        detached = true;
      }
      iface.claim();
      const out = iface.endpoints.find((e) => e.direction === "out")!;
      out.transfer(data, (err) => {
        const cleanup = () => {
          try {
            if (detached) iface!.attachKernelDriver();
          } catch {
            /* ignore */
          }
          try {
            device.close();
          } catch {
            /* ignore */
          }
        };
        iface!.release(() => {
          cleanup();
          err ? reject(new Error(`USB write failed: ${err.message}`)) : resolve();
        });
      });
    } catch (e) {
      try {
        device.close();
      } catch {
        /* ignore */
      }
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
