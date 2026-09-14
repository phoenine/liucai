export interface HoverRequest {
  id: string;
  revision: number;
}

export class HoverRequestTracker {
  private activeId: string | null = null;
  private revision = 0;

  begin(id: string): HoverRequest {
    this.activeId = id;
    this.revision += 1;
    return { id, revision: this.revision };
  }

  isCurrent(request: HoverRequest): boolean {
    return this.activeId === request.id && this.revision === request.revision;
  }

  clear(id?: string): void {
    if (id !== undefined && this.activeId !== id) {
      return;
    }
    this.activeId = null;
    this.revision += 1;
  }
}
