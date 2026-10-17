import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { IK_CHAINS, Mannequin } from "./bodyFactory/mannequin.js";
import { PRESETS } from "./bodyFactory/poses.js";

export type PoseTool = "rotate" | "translate";
export type PoseGender = "female" | "male";

const BODY_SHAPES: Record<PoseGender, Record<string, number>> = {
  female: { bust: 1, hips: 1, waist: 1, shoulders: 1, muscle: 1, headSize: 1 },
  male: { bust: 0, hips: 0.82, waist: 1.25, shoulders: 1.2, muscle: 1.18, headSize: 0.95 },
};

/** PoseScene 独占可变场景，React 只读取表单投影；捕获时才向创作参考所有者提交 PNG。 */
export function createPoseScene(
  container: HTMLElement,
  onJoint?: (index: number, bone: string) => void,
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xf2f2f2);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.setAttribute("aria-label", "3D pose viewport");
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(2.5, 1.8, 5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(3, 5, 4);
  scene.add(light);
  const figures: Mannequin[] = [];
  const genders: PoseGender[] = [];
  const material = new THREE.MeshStandardMaterial({ color: 0xc9a783, roughness: 0.85 });
  const inkMaterial = new THREE.MeshBasicMaterial({ color: 0x3c332c });
  const render = () => renderer.render(scene, camera);
  const disposeFigure = (figure: Mannequin) => {
    scene.remove(figure.group);
    figure.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  };
  const setCount = (count: number) => {
    const target = Math.max(1, Math.min(5, count));
    while (figures.length > target) {
      disposeFigure(figures.pop()!);
      genders.pop();
    }
    while (figures.length < target) {
      const figure = new Mannequin();
      figure.setPose(PRESETS[0]!.pose);
      figure.snapToGround();
      figure.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const old = object.material;
        if (Array.isArray(old)) old.forEach((item) => item.dispose());
        else old.dispose();
        object.material = object.userData.ink ? inkMaterial : material;
      });
      figures.push(figure);
      genders.push("female");
      scene.add(figure.group);
    }
    figures.forEach((figure, index) => {
      figure.group.position.x = (index - (target - 1) / 2) * 0.8;
    });
    camera.position.set(1.5, 1.8, 3 + (target - 1));
    controls.target.set(0, 0.9, 0);
    controls.update();
    if (selected && !figures[selected.index]?.bones[selected.bone]) selected = null;
    attachGizmo();
    render();
  };
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.setSize(0.7);
  scene.add(gizmo.getHelper());
  const handle = new THREE.Object3D();
  scene.add(handle);
  const dragStart = { handle: new THREE.Vector3(), root: new THREE.Vector3() };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let tool: PoseTool = "rotate";
  let selected: { index: number; bone: string } | null = null;
  let pointerDown: { x: number; y: number; onGizmo: boolean } | null = null;

  const placeHandle = () => {
    if (!selected) return;
    figures[selected.index]?.bones[selected.bone]?.getWorldPosition(handle.position);
    handle.updateMatrixWorld(true);
  };
  const attachGizmo = () => {
    const figure = selected ? figures[selected.index] : undefined;
    const bone = selected ? figure?.bones[selected.bone] : undefined;
    if (!figure || !bone || !selected) {
      gizmo.detach();
      return;
    }
    gizmo.setMode(tool);
    gizmo.setSpace(tool === "translate" ? "world" : "local");
    gizmo.showX = true;
    gizmo.showY = true;
    gizmo.showZ = true;
    if (tool === "translate") {
      placeHandle();
      gizmo.attach(handle);
    } else {
      gizmo.attach(bone);
    }
  };
  const select = (index: number, bone: string) => {
    const figure = figures[index];
    if (!figure?.bones[bone]) {
      selected = null;
      gizmo.detach();
      render();
      return;
    }
    selected = { index, bone };
    attachGizmo();
    render();
  };
  const setTool = (next: PoseTool) => {
    tool = next;
    attachGizmo();
    render();
  };
  const pickJoint = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      figures.flatMap((figure) => figure.parts.filter((part) => part.visible)),
      false,
    );
    const hit = hits[0]?.object;
    if (!hit) return null;
    const index = figures.findIndex((figure) => figure.parts.includes(hit as THREE.Mesh));
    const bone = hit.userData.bone;
    if (index < 0 || typeof bone !== "string") return null;
    return { index, bone };
  };

  controls.addEventListener("change", render);
  gizmo.addEventListener("dragging-changed", (event) => {
    const dragging = event.value === true;
    controls.enabled = !dragging;
    if (dragging && selected) {
      dragStart.handle.copy(handle.position);
      dragStart.root.copy(figures[selected.index]!.bones.root!.position);
    } else {
      figures[selected?.index ?? 0]?.snapToGround();
      placeHandle();
      if (selected) onJoint?.(selected.index, selected.bone);
    }
    render();
  });
  gizmo.addEventListener("objectChange", () => {
    if (!selected) return;
    const figure = figures[selected.index];
    if (!figure) return;
    if (tool === "rotate") {
      figure.clampBone(selected.bone);
      figure.group.updateMatrixWorld(true);
      figure.snapToGround();
    } else if (IK_CHAINS[selected.bone]) {
      figure.solveIK(selected.bone, handle.position, { limits: true });
    } else {
      figure.bones.root!.position
        .copy(dragStart.root)
        .add(handle.position)
        .sub(dragStart.handle);
      figure.group.updateMatrixWorld(true);
    }
    onJoint?.(selected.index, selected.bone);
    render();
  });
  gizmo.addEventListener("change", render);
  const onPointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY, onGizmo: gizmo.axis !== null };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = pointerDown;
    pointerDown = null;
    if (!start || start.onGizmo || gizmo.dragging || event.button !== 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const hit = pickJoint(event);
    if (!hit) return;
    select(hit.index, hit.bone);
    onJoint?.(hit.index, hit.bone);
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth,
      height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  observer.observe(container);
  setCount(1);
  return {
    setCount,
    select,
    setTool,
    snapshot: (index: number, bone: string) => ({
      shape: { ...figures[index]!.shape },
      angles: figures[index]!.getPose().bones[bone] ?? [0, 0, 0],
      gender: genders[index] ?? "female",
    }),
    setGender: (index: number, gender: PoseGender) => {
      const figure = figures[index];
      const shape = BODY_SHAPES[gender];
      if (!figure || !shape) return;
      genders[index] = gender;
      const height = figure.shape.height;
      const weight = figure.shape.weight;
      if (height === undefined || weight === undefined) return;
      figure.setShape({ ...shape, height, weight });
      figure.snapToGround();
      attachGizmo();
      render();
    },
    preset: (index: number, preset: number) => {
      const figure = figures[index]!;
      figure.setPose(PRESETS[preset]!.pose);
      figure.snapToGround();
      attachGizmo();
      render();
    },
    angle: (index: number, bone: string, axis: number, value: number) => {
      const figure = figures[index]!;
      const rotation = figure.bones[bone]!.rotation;
      if (axis === 0) rotation.x = THREE.MathUtils.degToRad(value);
      else if (axis === 1) rotation.y = THREE.MathUtils.degToRad(value);
      else rotation.z = THREE.MathUtils.degToRad(value);
      figure.clampBone(bone);
      figure.snapToGround();
      attachGizmo();
      render();
    },
    shape: (index: number, name: string, value: number) => {
      const figure = figures[index]!;
      figure.setShape({ [name]: value });
      figure.snapToGround();
      attachGizmo();
      render();
    },
    mirror: (index: number) => {
      figures[index]!.mirrorPose();
      figures[index]!.snapToGround();
      attachGizmo();
      render();
    },
    capture: async () => {
      render();
      return new Promise<Blob>((resolve, reject) =>
        renderer.domElement.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Pose capture failed"))),
          "image/png",
        ),
      );
    },
    dispose: () => {
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      gizmo.detach();
      scene.remove(gizmo.getHelper());
      gizmo.dispose();
      controls.removeEventListener("change", render);
      controls.dispose();
      figures.forEach(disposeFigure);
      material.dispose();
      inkMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
