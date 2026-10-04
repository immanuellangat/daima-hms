import { createClient } from "@/lib/supabase/server";

/** Private imaging files are served through short-lived signed URLs (10 minutes). */
export async function ImageLinks({ paths }: { paths: string[] }) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("imaging").createSignedUrls(paths, 600);
  if (!data?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {data.map((f, i) =>
        f.signedUrl ? (
          <a key={f.path ?? i} href={f.signedUrl} target="_blank" rel="noreferrer"
             className="rounded-md border border-border bg-slate-50 px-2 py-1 text-xs text-brand hover:bg-brand-soft">
            {(f.path ?? "").split("/").pop() || `Image ${i + 1}`}
          </a>
        ) : null,
      )}
    </div>
  );
}
