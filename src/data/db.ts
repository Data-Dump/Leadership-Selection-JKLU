import { supabase } from './supabaseClient';
import type {
  Candidate,
  Application,
  Evaluator,
  Rubric,
  Evaluation,
  Interview,
  FinalDecision,
  Position,
  SelectionCycle,
  Note,
  AuditEntry,
  DataQualityIssue,
} from '../types';

class SupabaseTable<T extends { id: string }> {
  constructor(private tableName: string) {}

  async toArray(): Promise<T[]> {
    const { data, error } = await supabase.from(this.tableName).select('*');
    if (error) {
      console.warn(`[Supabase] error fetching ${this.tableName}:`, error.message);
      return [];
    }
    return (data || []) as unknown as T[];
  }

  async count(): Promise<number> {
    const { count, error } = await supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.warn(`[Supabase] count error for ${this.tableName}:`, error.message);
      return 0;
    }
    return count || 0;
  }

  async get(id: string): Promise<T | undefined> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return undefined;
    return data as unknown as T;
  }

  async add(item: T): Promise<string> {
    const { error } = await supabase.from(this.tableName).upsert(item);
    if (error) {
      console.error(`[Supabase] add error on ${this.tableName}:`, error);
      throw error;
    }
    return item.id;
  }

  async bulkAdd(items: T[]): Promise<void> {
    if (!items || items.length === 0) return;
    // Chunk in batches of 200 for large inserts
    const chunkSize = 200;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const { error } = await supabase.from(this.tableName).upsert(chunk);
      if (error) {
        console.error(`[Supabase] bulkAdd error on ${this.tableName}:`, error);
        throw error;
      }
    }
  }

  async update(id: string, changes: Partial<T>): Promise<number> {
    const { error } = await supabase
      .from(this.tableName)
      .update(changes as any)
      .eq('id', id);
    if (error) {
      console.error(`[Supabase] update error on ${this.tableName}:`, error);
      throw error;
    }
    return 1;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from(this.tableName).delete().eq('id', id);
    if (error) {
      console.error(`[Supabase] delete error on ${this.tableName}:`, error);
      throw error;
    }
  }

  where(field: string) {
    const tableName = this.tableName;
    return {
      equals(value: any) {
        // Support boolean numeric 0/1 conversions if any
        let val = value;
        if (field === 'isDraft' && typeof value === 'number') val = value === 1;
        if (field === 'active' && typeof value === 'number') val = value === 1;

        return {
          async toArray(): Promise<T[]> {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .eq(field, val);
            if (error) {
              console.warn(`[Supabase] where.equals query error:`, error.message);
              return [];
            }
            return (data || []) as unknown as T[];
          },
          async first(): Promise<T | undefined> {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .eq(field, val)
              .maybeSingle();
            if (error || !data) return undefined;
            return data as unknown as T;
          },
          filter(predicate: (item: T) => boolean) {
            return {
              async toArray(): Promise<T[]> {
                const { data, error } = await supabase
                  .from(tableName)
                  .select('*')
                  .eq(field, val);
                if (error || !data) return [];
                return (data as unknown as T[]).filter(predicate);
              },
              async first(): Promise<T | undefined> {
                const arr = await this.toArray();
                return arr[0];
              },
            };
          },
        };
      },
      anyOf(values: any[]) {
        return {
          async toArray(): Promise<T[]> {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .in(field, values);
            if (error) {
              console.warn(`[Supabase] where.anyOf query error:`, error.message);
              return [];
            }
            return (data || []) as unknown as T[];
          },
        };
      },
      notEqual(value: any) {
        return {
          async toArray(): Promise<T[]> {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .neq(field, value);
            if (error) {
              console.warn(`[Supabase] where.notEqual query error:`, error.message);
              return [];
            }
            return (data || []) as unknown as T[];
          },
        };
      },
    };
  }

  filter(predicate: (item: T) => boolean) {
    const tableName = this.tableName;
    return {
      async toArray(): Promise<T[]> {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error || !data) return [];
        return (data as unknown as T[]).filter(predicate);
      },
      async first(): Promise<T | undefined> {
        const arr = await this.toArray();
        return arr[0];
      },
    };
  }

  orderBy(field: string) {
    const tableName = this.tableName;
    return {
      reverse() {
        return {
          async toArray(): Promise<T[]> {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .order(field, { ascending: false });
            if (error) {
              console.warn(`[Supabase] orderBy.reverse query error:`, error.message);
              return [];
            }
            return (data || []) as unknown as T[];
          },
        };
      },
      async toArray(): Promise<T[]> {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order(field, { ascending: true });
        if (error) {
          console.warn(`[Supabase] orderBy query error:`, error.message);
          return [];
        }
        return (data || []) as unknown as T[];
      },
    };
  }
}

export class CentralizedDatabase {
  candidates = new SupabaseTable<Candidate>('candidates');
  applications = new SupabaseTable<Application>('applications');
  evaluators = new SupabaseTable<Evaluator>('evaluators');
  rubrics = new SupabaseTable<Rubric>('rubrics');
  evaluations = new SupabaseTable<Evaluation>('evaluations');
  interviews = new SupabaseTable<Interview>('interviews');
  finalDecisions = new SupabaseTable<FinalDecision>('final_decisions');
  positions = new SupabaseTable<Position>('positions');
  selectionCycles = new SupabaseTable<SelectionCycle>('selection_cycles');
  notes = new SupabaseTable<Note>('notes');
  auditLog = new SupabaseTable<AuditEntry>('audit_log');
  dataQualityIssues = new SupabaseTable<DataQualityIssue>('data_quality_issues');
}

export const db = new CentralizedDatabase();
