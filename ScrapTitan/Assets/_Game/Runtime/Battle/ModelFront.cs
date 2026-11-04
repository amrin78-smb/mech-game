namespace ScrapTitan.Battle
{
    /// <summary>
    /// Which way a model faces when it arrives, and the turns that point it where the battle
    /// needs it.
    ///
    /// Every brief authors in the same convention: metres, Z up, the model's front on -Y and
    /// its left on +X. Unity's FBX import turns that into width on X, height on Y, and the
    /// front facing +Z. That is measured rather than reasoned about — see
    /// Logs/model-layout.txt, written by ModelDiagnostics, and pinned by ModelImportTests —
    /// because getting it wrong is quiet: the Titan would simply stand with its back to the
    /// raiders and still animate perfectly.
    ///
    /// The battle runs along X. The Titan holds the left and faces +X; raiders come from the
    /// right and face -X.
    /// </summary>
    public static class ModelFront
    {
        /// <summary>Degrees about Y that turn a model's front from +Z to +X.</summary>
        public const float ToPlusX = 90f;

        /// <summary>Degrees about Y that turn a model's front from +Z to -X.</summary>
        public const float ToMinusX = -90f;
    }
}
