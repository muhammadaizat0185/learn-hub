import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import UpdatePrompt from "./components/UpdatePrompt";
import "./styles.css";
import "./experience.css";
import "./preferences.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {import.meta.env.PROD && <UpdatePrompt />}
  </React.StrictMode>
);
