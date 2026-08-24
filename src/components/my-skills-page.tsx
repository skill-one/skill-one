import { useState } from "react";
import { Download, Trash2, Shield, Code, Zap, Cpu } from "lucide-react";

import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AgentFilterBar } from "./agent-filter-bar";

interface SkillCard {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  downloads: string;
  tag: string;
  enabled: boolean;
}

const mockSkills: SkillCard[] = [
  {
    id: "1",
    name: "守门人",
    description: "安全漏洞扫描与权限边界检查，守护代码库入口，拦截高风险提交",
    icon: Shield,
    downloads: "15.2k",
    tag: "安全",
    enabled: true,
  },
  {
    id: "2",
    name: "代码医生",
    description: "自动检测代码缺陷，提供修复建议与重构方案，支持 40+ 编程语言的深度分析",
    icon: Code,
    downloads: "12.3k",
    tag: "代码",
    enabled: true,
  },
  {
    id: "3",
    name: "精工匠人",
    description: "精雕细琢每一行代码，提供代码质量评分与最佳实践建议",
    icon: Code,
    downloads: "45.4k",
    tag: "代码",
    enabled: true,
  },
  {
    id: "4",
    name: "调度员",
    description: "任务编排与自动化流程管理，连接多 Agent 协同工作",
    icon: Zap,
    downloads: "23.9k",
    tag: "自动化",
    enabled: true,
  },
  {
    id: "5",
    name: "调音师",
    description: "优化项目性能与资源调配，自动调优配置参数",
    icon: Cpu,
    downloads: "21.7k",
    tag: "性能",
    enabled: false,
  },
  {
    id: "6",
    name: "驯兽师",
    description: "API 调试与接口驯化工具，自动生成 Mock 与契约测试",
    icon: Code,
    downloads: "14.1k",
    tag: "API",
    enabled: false,
  },
];

function SkillCardItem({ skill }: { skill: SkillCard }) {
  const [enabled, setEnabled] = useState(skill.enabled);
  const Icon = skill.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] font-semibold text-foreground">
            {skill.name}
          </h3>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
        {skill.description}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            {skill.downloads}
          </span>
          <Badge variant="secondary" className="text-[11px]">
            {skill.tag}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MySkillsPage() {
  return (
    <div className="flex h-full flex-col">
      <AgentFilterBar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-4">
          {mockSkills.map((skill) => (
            <SkillCardItem key={skill.id} skill={skill} />
          ))}
        </div>
      </div>
    </div>
  );
}
