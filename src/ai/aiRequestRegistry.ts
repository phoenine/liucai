export class AiRequestRegistry {
  private readonly active = new Map<string, { requestId: string; controller: AbortController }>();

  begin(contextKey: string, requestId: string): AbortController {
    this.active.get(contextKey)?.controller.abort();
    const controller = new AbortController();
    this.active.set(contextKey, { requestId, controller });
    return controller;
  }

  cancel(contextKey: string, requestId: string): boolean {
    const request = this.active.get(contextKey);
    if (!request || request.requestId !== requestId) return false;
    request.controller.abort();
    this.active.delete(contextKey);
    return true;
  }

  finish(contextKey: string, requestId: string, controller: AbortController): void {
    const request = this.active.get(contextKey);
    if (request?.requestId === requestId && request.controller === controller) {
      this.active.delete(contextKey);
    }
  }
}
