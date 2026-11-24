import net from "node:net";

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

/** The first busy port in the list, or null when all are free. */
export async function checkPortsFree(ports: number[]): Promise<number | null> {
  for (const port of ports) if (!(await isFree(port))) return port;
  return null;
}
