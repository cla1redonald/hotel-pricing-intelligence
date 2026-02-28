'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { ProjectionPoint } from '@/types';

interface PriceProjectionChartProps {
  projectionData: ProjectionPoint[];
}

function formatXAxis(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    return format(date, 'EEE d');
  } catch {
    return dateStr;
  }
}

function formatYAxis(value: number): string {
  return `£${Math.round(value)}`;
}

interface TooltipPayload {
  value: number;
  payload: ProjectionPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const price = payload[0].value;
  let formattedDate = label ?? '';
  try {
    if (label) {
      const date = parseISO(label);
      formattedDate = format(date, 'EEE, MMM d');
    }
  } catch {
    // use label as-is
  }

  const formattedPrice =
    price === Math.round(price) ? `£${Math.round(price)}` : `£${price.toFixed(2)}`;

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-tooltip"
      style={{
        backgroundColor: 'var(--navy-950)',
        color: 'var(--text-inverse)',
        border: 'none',
      }}
    >
      <p className="font-medium">{formattedDate}</p>
      <p className="font-semibold" style={{ color: 'var(--gold-400)' }}>
        {formattedPrice}
      </p>
    </div>
  );
}

export function PriceProjectionChart({ projectionData }: PriceProjectionChartProps) {
  const minPrice = Math.min(...projectionData.map((p) => p.price));
  const maxPrice = Math.max(...projectionData.map((p) => p.price));
  const pricePadding = (maxPrice - minPrice) * 0.15 || 10;

  return (
    <div
      className="mt-4"
      aria-label={`7-day price projection from £${Math.round(minPrice)} to £${Math.round(maxPrice)}`}
    >
      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">
        7-day price forecast
      </p>
      {/* height is controlled via the wrapper div; ResponsiveContainer reads 100% of it */}
      <div className="h-[120px] sm:h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={projectionData}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--gold-500)"
                stopOpacity={0.08}
              />
              <stop
                offset="95%"
                stopColor="var(--gold-500)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--bg-muted)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            dy={4}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={[minPrice - pricePadding, maxPrice + pricePadding]}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: 'var(--gold-300)',
              strokeWidth: 1,
              strokeDasharray: '3 3',
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--gold-500)"
            strokeWidth={2}
            fill="url(#goldGradient)"
            dot={{ r: 3, fill: 'var(--gold-500)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--gold-500)', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
