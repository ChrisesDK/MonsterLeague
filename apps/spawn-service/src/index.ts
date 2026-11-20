import { handle, type Env } from './handler';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, Math.floor(Date.now() / 1000));
  },
} satisfies ExportedHandler<Env>;
