import defaultTheme from "tailwindcss/defaultTheme";
import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      fontFamily: {
        // Kantumruy Pro covers both Khmer and Latin, so one stack handles
        // the app's mixed-script UI text instead of switching fonts per locale.
        sans: ['"Kantumruy Pro"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
} satisfies Config;
