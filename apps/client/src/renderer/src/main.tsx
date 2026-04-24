import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ScreenPickerDialog } from "./screens/ScreenPickerDialog.js";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const isPicker = new URLSearchParams(window.location.search).get("picker") === "1";

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isPicker ? <ScreenPickerDialog /> : <App />}
  </React.StrictMode>,
);
