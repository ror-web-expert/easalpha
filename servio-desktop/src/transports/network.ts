import net from "node:net";

/** Send raw bytes to host:port (default 9100) with a 5 s timeout. */
export function sendToNetworkPrinter(host: string, port: number, data: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error("Network printer has no host address"));
    const socket = new net.Socket();
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error(`Timed out after ${timeoutMs / 1000} s connecting to ${host}:${port}`)));
    socket.once("error", (e) => finish(new Error(`Cannot reach printer at ${host}:${port}: ${e.message}`)));
    socket.connect(port || 9100, host, () => {
      socket.write(data, (err) => {
        if (err) return finish(err);
        // Give the printer a moment to take the bytes before closing.
        socket.end();
        setTimeout(() => finish(), 150);
      });
    });
  });
}
