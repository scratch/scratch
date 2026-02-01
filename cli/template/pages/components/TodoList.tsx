import React, { useState, useEffect } from "react";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const STORAGE_KEY = "scratch-demo-todos";

const DEFAULT_TODOS: Todo[] = [
  { id: 1, text: "Create scratch project", completed: false },
  { id: 2, text: "Edit pages/index.mdx", completed: false },
  { id: 3, text: "Build with `scratch build`", completed: false },
  { id: 4, text: "Publish with `scratch publish`", completed: false },
];

function loadTodos(): Todo[] {
  if (typeof window === "undefined") return DEFAULT_TODOS;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : DEFAULT_TODOS;
}

function saveTodos(todos: Todo[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>(DEFAULT_TODOS);
  const [input, setInput] = useState("");

  useEffect(() => {
    setTodos(loadTodos());
  }, []);

  const updateTodos = (newTodos: Todo[]) => {
    setTodos(newTodos);
    saveTodos(newTodos);
  };

  const addTodo = () => {
    if (!input.trim()) return;
    updateTodos([
      ...todos,
      { id: Date.now(), text: input.trim(), completed: false },
    ]);
    setInput("");
  };

  const toggleTodo = (id: number) => {
    updateTodos(
      todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t,
      ),
    );
  };

  const deleteTodo = (id: number) => {
    updateTodos(todos.filter((t) => t.id !== id));
  };

  const reset = () => {
    updateTodos([...DEFAULT_TODOS]);
  };

  return (
    <div className="not-prose border border-gray-200 rounded-lg p-4 my-12 mx-2 sm:mx-8 md:mx-16 bg-gray-50">
      <h3 className="text-center text-lg font-semibold text-gray-900 mb-4">Todo List Demo</h3>
      <ul className="space-y-0">
        {todos.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100"
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span
                className={`flex-1 ${
                  todo.completed
                    ? "line-through text-gray-400"
                    : "text-gray-900"
                }`}
              >
                {todo.text}
              </span>
              <button
                onClick={() => deleteTodo(todo.id)}
                className="text-gray-400 hover:text-black transition-colors"
                aria-label="Delete todo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </li>
          ))}
        <li className="flex items-center gap-3 p-2">
          <input
            type="checkbox"
            disabled
            className="w-4 h-4 rounded border-gray-300"
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTodo()}
            placeholder="Add a todo..."
            className="flex-1 bg-transparent border-b border-transparent text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-300"
          />
        </li>
      </ul>

      <div className="mt-4 pt-4 flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {todos.filter((t) => !t.completed).length} remaining
        </span>
        <button
          onClick={reset}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
