import appLogoUrl from "../../../../../public/icon_512@2x.png";
import { cn } from "@/components/lib/utils.js";

/** ZenCode 蓝底章鱼应用图标；第三方提供方图标由各提供方控件单独处理。 */
export function ZenCodeAppLogo({ className }: { className?: string }) {
  return (
    <img
      src={appLogoUrl}
      alt=""
      width={1024}
      height={1024}
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
