import React, { useState, useEffect } from "react";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const STORAGE_KEY = "scratch-demo-todos";

let globalTodos: Todo[] | null = null;
let listeners: Set<(todos: Todo[]) => void> = new Set();

function getTodos(): Todo[] {
  if (globalTodos === null) {
    if (typeof window === "undefined") {
      globalTodos = [];
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      globalTodos = stored ? JSON.parse(stored) : [];
    }
  }
  return globalTodos;
}

function saveToStorage(todos: Todo[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function notifyListeners() {
  listeners.forEach((listener) => listener(getTodos()));
}

function useTodos() {
  const [todos, setTodos] = useState<Todo[]>(() => getTodos());

  useEffect(() => {
    setTodos(getTodos());

    const listener = (newTodos: Todo[]) => setTodos(newTodos);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const updateTodos = (newTodos: Todo[]) => {
    globalTodos = newTodos;
    saveToStorage(newTodos);
    notifyListeners();
  };

  const addTodo = (text: string) => {
    if (!text.trim()) return;
    updateTodos([
      ...getTodos(),
      { id: Date.now(), text: text.trim(), completed: false },
    ]);
  };

  const toggleTodo = (id: number) => {
    updateTodos(
      getTodos().map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t,
      ),
    );
  };

  const deleteTodo = (id: number) => {
    updateTodos(getTodos().filter((t) => t.id !== id));
  };

  const reset = () => {
    updateTodos([]);
  };

  return { todos, addTodo, toggleTodo, deleteTodo, reset };
}

export default function TodoList() {
  const { todos, addTodo, toggleTodo, deleteTodo, reset } = useTodos();
  const [input, setInput] = useState("");

  const handleAdd = () => {
    addTodo(input);
    setInput("");
  };

  return (
    <div className="not-prose border border-gray-200 rounded-lg p-4 my-12 mx-2 sm:mx-8 md:mx-16 bg-gray-50">
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a todo..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400"
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Add
        </button>
      </div>

      {todos.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          No todos yet. Add one above!
        </p>
      ) : (
        <ul className="space-y-2">
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
                className="text-gray-400 hover:text-red-500 transition-colors"
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
        </ul>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
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
