import defaultTheme from "tailwindcss/defaultTheme";
import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: {
        // Brand colour - Coffee Brown #6F4E37 - shared with the POS, for
        // primary buttons, the active nav tab and other selected states.
        // White text on it is ~7.4:1; hover goes one step darker.
        primary: {
          DEFAULT: "#6f4e37",
          hover: "#5c402d",
        },
      },
      fontFamily: {
        // Kantumruy Pro covers both Khmer and Latin, so one stack handles
        // the app's mixed-script UI text instead of switching fonts per locale.
        sans: ['"Kantumruy Pro"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
} satisfies Config;
