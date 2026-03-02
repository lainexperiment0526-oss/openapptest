declare namespace Deno {
  export function env(key: string): string | undefined;
}

declare function serve(handler: (req: Request) => Response | Promise<Response>): void;
