import React from "react";
import ReactDOM from "react-dom/client";
import { Splash } from "./components/Splash.js";
import "./styles.css";

const rootEl = document.getElementById("splash-root");
if (!rootEl) throw new Error("#splash-root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Splash />
  </React.StrictMode>,
);
