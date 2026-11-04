using System;
using System.Collections.Generic;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// Hard rule 2: projectiles, enemies, damage numbers and effects are pooled, and nothing
    /// allocates inside the update loop. Every member is built up front; an exhausted pool
    /// hands back nothing rather than growing, because growing mid fight is the allocation
    /// the rule exists to prevent. The Redmi A3 is the reason.
    /// </summary>
    public sealed class Pool<T> where T : class
    {
        private readonly T[] items;
        private readonly bool[] inUse;
        private int cursor;

        public Pool(int capacity, Func<int, T> create)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            items = new T[capacity];
            inUse = new bool[capacity];
            for (int i = 0; i < capacity; i++) items[i] = create(i);
        }

        public int Capacity => items.Length;

        public int ActiveCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < inUse.Length; i++) if (inUse[i]) n++;
                return n;
            }
        }

        /// <summary>A free member, or null when every one is out. Never allocates.</summary>
        public T Obtain()
        {
            for (int i = 0; i < items.Length; i++)
            {
                int index = cursor + i;
                if (index >= items.Length) index -= items.Length;
                if (inUse[index]) continue;
                inUse[index] = true;
                cursor = index + 1 >= items.Length ? 0 : index + 1;
                return items[index];
            }
            return null;
        }

        public void Recycle(T item)
        {
            for (int i = 0; i < items.Length; i++)
            {
                if (!ReferenceEquals(items[i], item)) continue;
                inUse[i] = false;
                return;
            }
        }

        public void RecycleAll()
        {
            for (int i = 0; i < inUse.Length; i++) inUse[i] = false;
            cursor = 0;
        }

        /// <summary>Every member, in use or not. For wiring at build time, not for the loop.</summary>
        public IReadOnlyList<T> All => items;
    }
}
