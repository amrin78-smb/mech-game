using System.Collections.Generic;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// The scrap a kill drops: it rises and fades where the enemy died, then recycles.
    /// Pooled like everything else spawned in battle.
    /// </summary>
    public sealed class ScrapDrops
    {
        private struct Drop
        {
            public Transform view;
            public Vector3 position;
            public float age;
            public bool active;
        }

        private readonly Drop[] drops;
        private readonly float rise;
        private readonly float lifetime;
        private int cursor;

        public ScrapDrops(TuningDef tuning, System.Func<int, Transform> makeView)
        {
            int capacity = Mathf.Max(tuning.pools.scrapPickups, 1);
            drops = new Drop[capacity];
            for (int i = 0; i < capacity; i++)
            {
                drops[i].view = makeView(i);
                drops[i].view.gameObject.SetActive(false);
            }
            rise = tuning.world3d.scrapPickupRise;
            lifetime = tuning.vfx.scrapPickupLifetime;
        }

        public void Spawn(Vector3 at)
        {
            for (int i = 0; i < drops.Length; i++)
            {
                int index = (cursor + i) % drops.Length;
                if (drops[index].active) continue;
                drops[index].active = true;
                drops[index].position = at;
                drops[index].age = 0f;
                drops[index].view.position = at;
                drops[index].view.gameObject.SetActive(true);
                cursor = (index + 1) % drops.Length;
                return;
            }
        }

        public void Update(float dt)
        {
            for (int i = 0; i < drops.Length; i++)
            {
                if (!drops[i].active) continue;
                drops[i].age += dt;
                if (drops[i].age >= lifetime)
                {
                    drops[i].active = false;
                    drops[i].view.gameObject.SetActive(false);
                    continue;
                }
                drops[i].position += new Vector3(0f, rise * dt, 0f);
                drops[i].view.position = drops[i].position;
                drops[i].view.Rotate(0f, 180f * dt, 0f, Space.Self);
            }
        }

        public void Clear()
        {
            for (int i = 0; i < drops.Length; i++)
            {
                drops[i].active = false;
                drops[i].view.gameObject.SetActive(false);
            }
        }
    }
}
