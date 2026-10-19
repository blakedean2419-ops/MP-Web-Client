export interface Tag {
  id: string;
  name: string;
  value: number;
  unit: string;
  description: string;
  min: number;
  max: number;
  warning?: number;
  timestamp: number;
  quality: "good" | "bad";
}
export interface Sample {
  timestamp: number;
  value: number;
}
export interface Status {
  mode: "demo" | "xml";
  connected: boolean;
  lastSuccess: number | null;
  error: string | null;
  pollIntervalMs: number;
}
export interface Snapshot {
  tags: Tag[];
  status: Status;
}
