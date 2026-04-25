import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ScreenPickerDialog } from "./screens/ScreenPickerDialog.js";
import "./styles.css";

declare const __APP_VERSION__: string;
// eslint-disable-next-line no-console
console.log(`[redvoice] renderer boot — v${typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"}`);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const isPicker = new URLSearchParams(window.location.search).get("picker") === "1";

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isPicker ? <ScreenPickerDialog /> : <App />}
  </React.StrictMode>,
);
