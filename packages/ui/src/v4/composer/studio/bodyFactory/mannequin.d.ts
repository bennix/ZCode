import type { Group, Object3D, Mesh, Vector3 } from "three";
export interface Pose { root?: number[]; bones: Record<string, number[]> }
export const BONE_DEFS: Record<string, { label: string; limits: number[][] }>;
export const BONE_NAMES: string[];
export const IK_CHAINS: Record<string, string[]>;
export class Mannequin {
  group: Group;
  bones: Record<string, Object3D>;
  parts: Mesh[];
  inks: Mesh[];
  shape: Record<string, number>;
  constructor();
  setShape(shape: Record<string, number>): void;
  getPose(): Pose;
  setPose(pose: Pose, options?: { partial?: boolean }): void;
  mirrorPose(): void;
  clampBone(name: string): void;
  solveIK(name: string, target: Vector3, options?: { limits?: boolean; iterations?: number }): boolean;
  snapToGround(): void;
}
