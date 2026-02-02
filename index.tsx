import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@excalidraw/excalidraw/index.css";

import * as ExcalidrawLib from "@excalidraw/excalidraw";

import App from "./components/ExampleApp";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App
      appTitle=""
      useCustom={(api: any, args?: any[]) => { }}
      excalidrawLib={ExcalidrawLib}
    >
      <ExcalidrawLib.Excalidraw />
    </App>
  </StrictMode>,
);
