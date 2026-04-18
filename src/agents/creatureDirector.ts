// Phase 4: Creature Director — Dedalus container client (mock: direct OpenAI call)
export class CreatureDirector {
  async query(_scene: string, _biosignalSummary: string): Promise<unknown> {
    return {}; // stub
  }
}
