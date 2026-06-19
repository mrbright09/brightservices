namespace BFT.Shared.Triage;

/// <summary>
/// Health triage priority rules shared by BFT.Api and BFT.Desktop.
/// No infrastructure dependencies.
/// </summary>
public class TriageRules
{
    private static readonly HashSet<string> CriticalSymptoms = new(StringComparer.OrdinalIgnoreCase)
    {
        "chest pain", "difficulty breathing", "unconscious", "stroke", "severe bleeding"
    };

    public TriagePriority Assess(int painScore, IEnumerable<string> symptoms, bool isElderly)
    {
        var symptomList = symptoms.ToList();

        if (painScore >= 8 || symptomList.Any(s => CriticalSymptoms.Contains(s)))
            return TriagePriority.Critical;

        if (painScore >= 6 || (isElderly && painScore >= 4))
            return TriagePriority.High;

        if (painScore >= 3)
            return TriagePriority.Medium;

        return TriagePriority.Low;
    }
}

public enum TriagePriority { Critical, High, Medium, Low }
