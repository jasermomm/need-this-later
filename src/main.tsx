import React from "react";
import { createRoot } from "react-dom/client";
import IneedthislaterApp from "../app/IneedthislaterApp";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(<React.StrictMode><IneedthislaterApp /></React.StrictMode>);
