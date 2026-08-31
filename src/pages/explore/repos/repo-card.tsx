import { useNavigate } from "react-router";
import { Download, Package, Star } from "lucide-react";

import type { RepoInfo } from "../../../lib/registry/protocol";
import { cn, formatCount } from "../../../lib/utils";
import { OwnerAvatar } from "../../../components/owner-avatar";

/**
 * A single source-repository card on the repos page: the repository avatar
 * and name, how many registry skills it contains, and its aggregate
 * installs/stars. Clicking through opens the explore page pre-filtered to
 * the repository's skills (via the `?repo=` search query).
 */
export function RepoCard({ repo }: { repo: RepoInfo }) {
  const navigate = useNavigate();
  const owner = repo.repo.split("/")[0];

  return (
    <article
      onClick={() =>
        navigate(`/explore?repo=${encodeURIComponent(repo.repo)}`)
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/explore?repo=${encodeURIComponent(repo.repo)}`);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`查看 ${repo.repo} 中的 Skill`}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-xl border border-border/70 bg-card p-4 transition-all duration-150",
        "hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.18)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <OwnerAvatar owner={owner} className="h-9 w-9 text-[15px]" />
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {repo.repo}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">
              {formatCount(repo.skills)}
            </span>
            个 Skill
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Download className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">
            {formatCount(repo.downloads)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium tabular-nums">
            {formatCount(repo.stars)}
          </span>
        </span>
      </div>
    </article>
  );
}
