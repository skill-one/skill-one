import { Construction } from "lucide-react";

/** Generic under-construction page for admin-center routes (标签/工具/更新/设置). */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-[12vh] text-muted-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground/70">
        <Construction className="h-6 w-6" />
      </div>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      <p className="text-[12px]">该模块正在建设中，敬请期待</p>
    </div>
  );
}
