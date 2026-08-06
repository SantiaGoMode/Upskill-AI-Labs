import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { labById, labs } from "../../lib/labs";
import { LabRunner } from "../../components/lab-runner";

export function generateStaticParams() {
  return labs.map((lab) => ({ labId: lab.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ labId: string }> }): Promise<Metadata> {
  const { labId } = await params;
  const lab = labById(labId);
  return { title: lab ? `Lab ${lab.number} · ${lab.title}` : "Lab not found" };
}

export default async function LabPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params;
  const lab = labById(labId);
  if (!lab) notFound();
  // Keyed so moving between labs remounts with clean state instead of resetting it.
  return <LabRunner key={lab.id} lab={lab} />;
}
