using UnityEngine;
using UnityEngine.InputSystem;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// Hard rule 9's control scheme. A drag at any moment takes manual control of the main
    /// cannon; a tap instead sets the focus target. A touch drag has to start on the lower
    /// half of the screen, and its aim point sits above the finger so a thumb never covers
    /// what is being shot at.
    ///
    /// Reads the low-level pointer rather than an action asset, so one path covers the mouse
    /// in the editor and a finger on the phone. The project runs the Input System backend
    /// only, so UnityEngine.Input is not available here.
    /// </summary>
    public sealed class BattleInput
    {
        private readonly Camera camera;
        private readonly TuningDef tuning;
        private readonly float aimPlaneZ;

        private bool pointerDown;
        private bool dragOriginAllowed;
        private Vector2 dragStart;

        public BattleInput(Camera camera, TuningDef tuning, float aimPlaneZ)
        {
            this.camera = camera;
            this.tuning = tuning;
            this.aimPlaneZ = aimPlaneZ;
        }

        /// <summary>True while a finger or button is held.</summary>
        public bool IsPressed
        {
            get
            {
                Pointer pointer = Pointer.current;
                return pointer != null && pointer.press.isPressed;
            }
        }

        private static bool IsTouch => Touchscreen.current != null
                                       && ReferenceEquals(Pointer.current, Touchscreen.current);

        public Vector2 ScreenPosition
        {
            get
            {
                Pointer pointer = Pointer.current;
                return pointer == null ? Vector2.zero : pointer.position.ReadValue();
            }
        }

        /// <summary>
        /// Where a screen point lands in the world. The lanes sit at different depths, so a
        /// drag is resolved onto one plane in depth: the lane the Titan stands in. Aiming is
        /// a side-on silhouette, so depth is not something the player picks.
        /// </summary>
        public Vector3 WorldPoint(Vector2 screen)
        {
            Ray ray = camera.ScreenPointToRay(screen);
            float dz = ray.direction.z;
            if (Mathf.Abs(dz) < 1e-5f) return ray.origin;
            float t = (aimPlaneZ - ray.origin.z) / dz;
            return ray.origin + ray.direction * t;
        }

        /// <summary>
        /// Drives the weapon for one frame. Returns the world point of a tap that was not a
        /// drag, for the caller to turn into a focus target, or null if there was none.
        /// </summary>
        public Vector3? Update(WeaponSystem weapon, bool battleOver)
        {
            bool pressed = IsPressed;
            Vector2 screen = ScreenPosition;

            if (pressed && !pointerDown)
            {
                pointerDown = true;
                dragStart = screen;
                dragOriginAllowed = !IsTouch
                    || screen.y <= Screen.height * tuning.targeting.touchDragOriginMinYFraction;
                return null;
            }

            if (pressed && pointerDown)
            {
                if (battleOver) return null;
                if (weapon.IsManualAiming)
                {
                    weapon.UpdateManualAim(WorldPoint(AimScreenPoint(screen)));
                    return null;
                }
                if (!dragOriginAllowed) return null;
                float travelled = Vector2.Distance(dragStart, screen);
                float threshold = Screen.height * tuning.world3d.dragThresholdScreenFraction;
                if (travelled >= threshold)
                    weapon.BeginManualAim(WorldPoint(AimScreenPoint(screen)));
                return null;
            }

            if (!pointerDown) return null;
            pointerDown = false;
            if (battleOver) return null;

            if (weapon.IsManualAiming)
            {
                weapon.UpdateManualAim(WorldPoint(AimScreenPoint(screen)));
                weapon.ReleaseManualAim();
                return null;
            }

            // Not a drag, so it is a tap.
            return WorldPoint(screen);
        }

        /// <summary>A touch aims above the finger; a mouse aims where it points.</summary>
        private Vector2 AimScreenPoint(Vector2 screen)
        {
            if (!IsTouch) return screen;
            return new Vector2(
                screen.x,
                screen.y + Screen.height * tuning.world3d.touchAimOffsetScreenFraction);
        }

        public void Cancel(WeaponSystem weapon)
        {
            pointerDown = false;
            weapon.CancelManualAim();
        }
    }
}
