import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./routes/Home";
import { Channels } from "./routes/Channels";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/channels" element={<Channels />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
