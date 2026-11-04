import { useEffect, useState } from "react";

const STORAGE_KEY = "app-theme";

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {}

  return "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) =>
      current === "light" ? "dark" : "light"
    );
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      title="Đổi giao diện"
      aria-label="Đổi giao diện sáng tối"
    >
      {theme === "light" ? "☾" : "☀"}{" "}
      {theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
    </button>
  );
}