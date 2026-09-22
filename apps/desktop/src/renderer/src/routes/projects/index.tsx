import { createFileRoute } from "@tanstack/react-router";
import { ProjectsOverviewPage } from "@/features/projects/ProjectsOverviewPage";

export const Route = createFileRoute("/projects/")({ component: ProjectsOverviewPage });
