import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ConfigProvider } from "antd";
import { HashRouter } from "react-router-dom";
// Custom theme configuration
const theme = {
  token: {
    colorPrimary: "#1890ff",
    borderRadius: 4,
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#f5222d",
    colorInfo: "#1890ff",
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  </React.StrictMode>
);
