import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Tag } from "./types";
export type Trace = { id: string; color: string; visible: boolean };
export type Reading = {
  timestamp: number;
  values: Record<string, number | null>;
};
export default function TrendChart({
  readings,
  traces,
  tags,
  relative,
  domain,
}: {
  readings: Reading[];
  traces: Trace[];
  tags: Tag[];
  relative: boolean;
  domain?: [number, number];
}) {
  const start = readings[0]?.timestamp ?? 0;
  const data = readings.map((r) => ({
    timestamp: r.timestamp,
    ...Object.fromEntries(
      traces.map((t, i) => [`trace${i}`, r.values[t.id] ?? null]),
    ),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 22, right: 24, left: 5, bottom: 25 }}
      >
        <CartesianGrid stroke="#23343e" strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={["dataMin", "dataMax"]}
          stroke="#97a9b8"
          minTickGap={45}
          tick={{ fontSize: 12 }}
          tickFormatter={(n) =>
            relative
              ? ((n - start) / 1000).toFixed(0)
              : new Date(n).toLocaleTimeString()
          }
          label={{
            value: relative ? "Time (s)" : "Time",
            position: "bottom",
            fill: "#d6e1ea",
          }}
        />
        <YAxis
          domain={domain && domain[0] < domain[1] ? domain : ["auto", "auto"]}
          allowDataOverflow
          stroke="#97a9b8"
          tick={{ fontSize: 12 }}
          width={65}
          label={{
            value: "Amplitude",
            angle: -90,
            position: "insideLeft",
            fill: "#d6e1ea",
          }}
        />
        <Tooltip
          labelFormatter={(n) => new Date(Number(n)).toLocaleTimeString()}
          contentStyle={{
            background: "#0c1c29",
            border: "1px solid #2c5572",
            borderRadius: 6,
          }}
          formatter={(value, name) => [
            Number(value).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            }),
            name,
          ]}
        />
        {traces.map(
          (t, i) =>
            t.visible && (
              <Line
                key={t.id}
                dataKey={`trace${i}`}
                name={`${tags.find((tag) => tag.id === t.id)?.name ?? t.id} (${tags.find((tag) => tag.id === t.id)?.unit || "no unit"})`}
                stroke={t.color}
                strokeWidth={2}
                dot={data.length === 1}
                connectNulls={false}
                isAnimationActive={false}
              />
            ),
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
