import React from "react";
import { createRoot } from "react-dom/client";
import "./storage.js"; // installs window.storage before App/AdminDashboard render
import App from "./App.jsx";
import AdminDashboard from "./AdminDashboard.jsx";

const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";

const root = createRoot(document.getElementById("root"));
root.render(isAdmin ? <AdminDashboard /> : <App />);
