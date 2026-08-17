// Generated from docs/design-system/01_Foundations/tokens/pico.tokens.json; do not edit by hand.
//
// ADR 0133 L3. An early materialization, and the four things one states:
//
// 1. Why late derivation is not affordable: these are read by an Electron
//    renderer under a CSP that forbids fetching anything, and by a PDF
//    generator that runs with no filesystem root it may reach. Neither can
//    open the token source at the moment it needs a colour, so the flatten
//    happens at build time or it does not happen.
// 2. Which direction the drift runs, and why that is the fail-safe one:
//    towards *stale*. A copy can only lag the source, never lead it, so a
//    surface renders the palette from last release rather than a colour
//    nobody chose.
// 3. Where the drift is corrected: `pnpm design-system:generate` rewrites
//    every copy from the one source, and `design-system:check` runs the same
//    generator with `--check` inside `release:verify`, so a lagging copy
//    fails the release rather than shipping.
// 4. What a consumer may still assume: that every copy is byte-identical to
//    the others and to the source at release time - and nothing more. The
//    file has no identity of its own: it may be regenerated without a
//    version, and no further derivation may take it as input where the
//    token source would have served.
export const picoTokens = {
  "color": {
    "background": {
      "deep": "#04101C",
      "base": "#071827"
    },
    "surface": {
      "primary": "#0C2032",
      "secondary": "#112A3E",
      "active": "#17344A"
    },
    "border": {
      "subtle": "#27475D",
      "strong": "#6A808F"
    },
    "text": {
      "primary": "#E8F3FA",
      "secondary": "#A7BDCB",
      "muted": "#8A9DAB",
      "disabled": "#536876",
      "onPrimary": "#03111C"
    },
    "brand": {
      "primary": "#2CCFFF",
      "primaryStrong": "#15AEE8",
      "primarySoft": "#123E55",
      "focus": "#72E1FF"
    },
    "status": {
      "active": "#2CCFFF",
      "listening": "#348CFF",
      "thinking": "#9A70FF",
      "warning": "#FFB13B",
      "blocked": "#FF4E5D",
      "success": "#59E579"
    },
    "context": {
      "technology": "#358DFF",
      "waterInfrastructure": "#26D3D0",
      "fireDepartment": "#E84B42",
      "organization": "#49CDB1",
      "smartHome": "#FF963D",
      "communication": "#29CFF2",
      "energy": "#F5A62E",
      "nightFocus": "#8767E8"
    }
  },
  "space": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "24px",
    "6": "32px",
    "7": "48px",
    "8": "64px"
  },
  "radius": {
    "chip": "10px",
    "button": "14px",
    "input": "14px",
    "message": "20px",
    "card": "20px",
    "dialog": "24px",
    "illustration": "30px"
  },
  "motion": {
    "fast": "150ms",
    "normal": "240ms",
    "slow": "360ms",
    "easeStandard": [
      0.2,
      0.8,
      0.2,
      1
    ]
  },
  "typography": {
    "fontFamily": {
      "sans": [
        "Inter",
        "ui-sans-serif",
        "system-ui",
        "-apple-system",
        "Segoe UI",
        "sans-serif"
      ]
    }
  },
  "theme": {
    "light": {
      "color": {
        "background": {
          "deep": "#EAF3F8",
          "base": "#F5F9FC"
        },
        "surface": {
          "primary": "#FFFFFF",
          "secondary": "#EDF4F8",
          "active": "#E0EDF3"
        },
        "border": {
          "subtle": "#AAC2CF",
          "strong": "#778790"
        },
        "text": {
          "primary": "#0A2132",
          "secondary": "#355568",
          "muted": "#546C7B",
          "disabled": "#8BA0AC"
        },
        "brand": {
          "primarySoft": "#D7F4FC",
          "focus": "#118CBB"
        }
      }
    }
  }
} as const;
