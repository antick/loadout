import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";
import { APP_MENU_LABELS, buildAppMenu } from "./app-menu";

/** Every role in the menu, submenus included. */
function rolesOf(menu: readonly MenuItemConstructorOptions[]): string[] {
  return menu.flatMap((item) => [
    ...(item.role ? [item.role] : []),
    ...(Array.isArray(item.submenu) ? rolesOf(item.submenu) : []),
  ]);
}

const submenuOf = (menu: MenuItemConstructorOptions[], label: string): string[] => {
  const item = menu.find((entry) => entry.label === label);
  return Array.isArray(item?.submenu) ? rolesOf(item.submenu) : [];
};

describe("application menu", () => {
  it("has no reload or developer tools in a release build", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const roles = rolesOf(buildAppMenu({ platform, packaged: true }));
      expect(roles).not.toContain("reload");
      expect(roles).not.toContain("forceReload");
      expect(roles).not.toContain("toggleDevTools");
    }
  });

  it("keeps reload and developer tools while developing", () => {
    const roles = rolesOf(buildAppMenu({ platform: "darwin", packaged: false }));
    expect(roles).toEqual(expect.arrayContaining(["reload", "toggleDevTools"]));
  });

  it("gives macOS its app menu, edit shortcuts, zoom and window roles", () => {
    const menu = buildAppMenu({ platform: "darwin", packaged: true });
    expect(rolesOf(menu)).toEqual(
      expect.arrayContaining(["about", "hide", "hideOthers", "unhide", "quit"]),
    );
    expect(submenuOf(menu, APP_MENU_LABELS.edit)).toEqual(
      expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "selectAll"]),
    );
    expect(submenuOf(menu, APP_MENU_LABELS.view)).toEqual(["resetZoom", "zoomIn", "zoomOut"]);
    expect(submenuOf(menu, APP_MENU_LABELS.window)).toEqual(
      expect.arrayContaining(["minimize", "zoom", "close"]),
    );
  });

  it("leaves the macOS-only roles out elsewhere but keeps editing and zoom", () => {
    const menu = buildAppMenu({ platform: "win32", packaged: true });
    const roles = rolesOf(menu);
    for (const macOnly of ["about", "services", "hide", "hideOthers", "unhide", "front", "zoom"]) {
      expect(roles).not.toContain(macOnly);
    }
    expect(submenuOf(menu, APP_MENU_LABELS.edit)).toEqual(
      expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "selectAll"]),
    );
    expect(roles).toEqual(expect.arrayContaining(["zoomIn", "quit"]));
  });
});
