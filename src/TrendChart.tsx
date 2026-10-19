import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Sample, Tag } from "./types";

export default function TrendChart({
  samples,
  tag,
}: {
  samples: Sample[];
  tag?: Tag;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={samples}
        margin={{ top: 20, right: 18, left: -18, bottom: 5 }}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#159d8b" stopOpacity={0.17} />
            <stop offset="100%" stopColor="#159d8b" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 5"
          vertical={false}
          stroke="#e8edec"
        />
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(n) =>
            new Date(n).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          }
          tick={{ fontSize: 11, fill: "#89918f" }}
          axisLine={false}
          tickLine={false}
          minTickGap={55}
          dy={10}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize: 11, fill: "#89918f" }}
          tickFormatter={(n) =>
            Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
          }
          axisLine={false}
          tickLine={false}
          width={66}
        />
        <Tooltip
          labelFormatter={(n) => new Date(Number(n)).toLocaleString()}
          formatter={(value) => [
            `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${tag?.unit ?? ""}`,
            tag?.name ?? "Value",
          ]}
          contentStyle={{
            border: "1px solid #e3e8e6",
            borderRadius: 10,
            fontSize: 12,
          }}
        />
        <Area
          type="linear"
          dataKey="value"
          stroke="#159d8b"
          strokeWidth={2.3}
          fill="url(#trendFill)"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 5, stroke: "#fff", strokeWidth: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
