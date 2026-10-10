"use client";
import { useRef, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { API_URL, ApiError, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Button, Field, Spinner } from "@/components/ui";
import { imageProblem } from "@/components/admin/catalog-helpers";

export interface UploadResult { key: string; filename: string; content_type: string; bytes: number }

/** POST /uploads as multipart with the admin token. api() always sends JSON, so this uses fetch directly. */
export async function uploadImage(file: File): Promise<UploadResult> {
  const s = useAuthStore.getState();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (s.session?.access_token) headers.Authorization = `Bearer ${s.session.access_token}`;
  if (s.branchId) headers["X-Branch-Id"] = s.branchId;
  const body = new FormData();
  body.append("file", file, file.name);
  let res: Response;
  try { res = await fetch(`${API_URL}/uploads`, { method: "POST", headers, body }); }
  catch { throw new ApiError("network", "Cannot reach the server", 0); }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? `http_${res.status}`, err?.message ?? "Upload failed", res.status);
  }
  return data as UploadResult;
}

/** SPEC: product image, PNG/JPG/WEBP, max 5 MB. value is the image key (a full URL from the API) or empty. */
export function ImageUpload({ value, onChange, label = "Image", hint, className }: { value: string | null | undefined; onChange: (key: string | null) => void; label?: string; hint?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try { onChange((await uploadImage(file)).key); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <Field label={label} error={error ?? undefined} hint={error ? undefined : hint ?? "PNG, JPG or WEBP, up to 5 MB"} className={className}>
      <div className="flex items-center gap-3">
        <div className={cn("grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted", busy && "opacity-60")}>
          {busy ? <Spinner /> : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : <ImageIcon className="h-6 w-6 text-fg-muted" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}><Upload className="h-4 w-4" /> {value ? "Replace" : "Choose file"}</Button>
          {value ? <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setError(null); }} disabled={busy}><Trash2 className="h-4 w-4 text-danger" /> Remove</Button> : null}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </Field>
  );
}
