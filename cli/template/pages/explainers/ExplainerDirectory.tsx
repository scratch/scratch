import { explainers, type Explainer } from "../../.scratch/generated/explainerData";
import { StatusBadge } from "../../src/explainers";

function PublishedBadge({ published }: { published: Explainer["published"] }) {
  if (published === null) return null;

  return <StatusBadge tone={published ? "good" : "neutral"}>{published ? "Published" : "Draft"}</StatusBadge>;
}

export default function ExplainerDirectory() {
  const publishedExplainers = explainers.filter((explainer) => explainer.published === true);

  if (publishedExplainers.length === 0) {
    return (
      <p className="not-prose rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        No published explainers found.
      </p>
    );
  }

  return (
    <div className="not-prose my-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Explainer</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Date</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
          {publishedExplainers.map((explainer) => (
            <tr key={explainer.href} className="align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
              <td className="px-4 py-4">
                <a
                  href={explainer.href}
                  className="font-medium text-slate-950 underline decoration-slate-300 underline-offset-4 hover:text-blue-700 dark:text-white dark:decoration-slate-600 dark:hover:text-cyan-300"
                >
                  {explainer.title}
                </a>
                {explainer.description ? (
                  <p className="mt-1 max-w-2xl text-slate-600 dark:text-slate-300">
                    {explainer.description}
                  </p>
                ) : null}
                {explainer.date ? (
                  <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:hidden">
                    {explainer.date}
                  </p>
                ) : null}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300 sm:table-cell">
                {explainer.date || "Undated"}
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                <PublishedBadge published={explainer.published} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
