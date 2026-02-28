import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: [
  				'var(--font-inter)',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'sans-serif'
  			]
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			navy: {
  				'600': 'var(--navy-600)',
  				'700': 'var(--navy-700)',
  				'800': 'var(--navy-800)',
  				'900': 'var(--navy-900)',
  				'950': 'var(--navy-950)'
  			},
  			gold: {
  				'300': 'var(--gold-300)',
  				'400': 'var(--gold-400)',
  				'500': 'var(--gold-500)',
  				'600': 'var(--gold-600)'
  			},
  			discount: {
  				DEFAULT: 'var(--discount)',
  				bg: 'var(--discount-bg)'
  			},
  			premium: {
  				DEFAULT: 'var(--premium)',
  				bg: 'var(--premium-bg)'
  			},
  			neutral: {
  				DEFAULT: 'var(--neutral)',
  				bg: 'var(--neutral-bg)'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			card: '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
  			'card-hover': '0 4px 12px rgba(15,23,42,0.12), 0 2px 4px rgba(15,23,42,0.06)',
  			search: '0 4px 16px rgba(15,23,42,0.12)',
  			tooltip: '0 4px 8px rgba(15,23,42,0.16)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
