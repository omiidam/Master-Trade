/**
 * Memory with provenance.
 *
 * Every stored item records where it came from (tool, model, human) so the
 * agent's knowledge base remains auditable. Phase 1 keeps memory in-memory;
 * the interface is the future persistence seam.
 */

import type { EpistemicKind, ModelStatement } from '../types.js';
import type { ToolDescriptor } from '../tools/framework.js';

export type MemoryOrigin =
  | { type: 'tool'; descriptor: ToolDescriptor }
  | { type: 'model'; statement: ModelStatement }
  | { type: 'human'; note: string };

export interface MemoryEntry {
  id: string;
  createdAt: string; // ISO timestamp
  origin: MemoryOrigin;
  epistemicKind: EpistemicKind;
  content: string;
}

export interface MemoryStore {
  append(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry;
  query(pred: (e: MemoryEntry) => boolean): MemoryEntry[];
  all(): readonly MemoryEntry[];
}

export class InMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private counter = 0;

  append(data: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const entry: MemoryEntry = {
      ...data,
      id: `mem_${++this.counter}`,
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  query(pred: (e: MemoryEntry) => boolean): MemoryEntry[] {
    return this.entries.filter(pred);
  }

  all(): readonly MemoryEntry[] {
    return this.entries;
  }
}
