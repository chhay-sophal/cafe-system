import { vNumeric } from "~/utils/numericInput";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive("numeric", vNumeric);
});
