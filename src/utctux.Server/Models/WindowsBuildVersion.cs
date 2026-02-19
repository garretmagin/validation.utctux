using System.Text.RegularExpressions;

namespace utctux.Server.Models;

/// <summary>
/// Parses Windows Fully Qualified Build Names (FQBN) into their component parts.
/// Supports multiple formats:
///   4-part: "19583.1000.main.200309-1320"            → Version.Qfe.Branch.Timestamp
///   5-part: "19583.1000.amd64fre.main.200309-1320"   → Version.Qfe.BuildFlavor.Branch.Timestamp
///   6-part: "10.0.26100.1.rs_prerelease.240824-1532" → Major.Minor.Version.Qfe.Branch.Timestamp
/// </summary>
public partial class WindowsBuildVersion
{
    public string Branch { get; }
    public int Version { get; }
    public int Qfe { get; }
    public string Timestamp { get; }
    public string? BuildFlavor { get; }

    private WindowsBuildVersion(string branch, int version, int qfe, string timestamp, string? buildFlavor = null)
    {
        Branch = branch;
        Version = version;
        Qfe = qfe;
        Timestamp = timestamp;
        BuildFlavor = buildFlavor;
    }

    /// <summary>
    /// Parses any supported FQBN format (4-part, 5-part, or 6-part).
    /// </summary>
    public static WindowsBuildVersion? FromAnySupportedFormat(string? buildString)
    {
        if (string.IsNullOrWhiteSpace(buildString))
            return null;

        var parts = buildString.Split('.');

        return parts.Length switch
        {
            // 4-part: Version.Qfe.Branch.Timestamp
            4 when int.TryParse(parts[0], out var version) && int.TryParse(parts[1], out var qfe)
                => new WindowsBuildVersion(parts[2], version, qfe, parts[3]),

            // 5-part: Version.Qfe.BuildFlavor.Branch.Timestamp
            5 when int.TryParse(parts[0], out var version) && int.TryParse(parts[1], out var qfe)
                => new WindowsBuildVersion(parts[3], version, qfe, parts[4], parts[2]),

            // 6-part: Major.Minor.Version.Qfe.Branch.Timestamp (e.g. 10.0.26100.1.rs_prerelease.240824-1532)
            6 when int.TryParse(parts[2], out var version) && int.TryParse(parts[3], out var qfe)
                => new WindowsBuildVersion(parts[4], version, qfe, parts[5]),

            _ => null
        };
    }

    /// <summary>
    /// Parses a 4-part FQBN (Version.Qfe.Branch.Timestamp), optionally attaching a build flavor.
    /// </summary>
    public static WindowsBuildVersion? From4PartFqbn(string? buildName, string? buildFlavor = null)
    {
        if (string.IsNullOrWhiteSpace(buildName))
            return null;

        var parts = buildName.Split('.');
        if (parts.Length != 4 || !int.TryParse(parts[0], out var version) || !int.TryParse(parts[1], out var qfe))
            return null;

        return new WindowsBuildVersion(parts[2], version, qfe, parts[3], buildFlavor);
    }

    /// <summary>
    /// Returns true if the string matches the Discover build name format (4-part: digits.digits.word.digits-digits).
    /// </summary>
    public static bool IsDiscoverBuildName(string? buildName)
    {
        return !string.IsNullOrWhiteSpace(buildName)
            && DiscoverBuildNameRegex().IsMatch(buildName);
    }

    /// <summary>
    /// Returns the 4-part FQBN string: "Version.Qfe.Branch.Timestamp"
    /// </summary>
    public string To4PartFQBN() => $"{Version}.{Qfe}.{Branch}.{Timestamp}";

    /// <summary>
    /// Returns the 5-part FBN string: "Version.Qfe.BuildFlavor.Branch.Timestamp"
    /// </summary>
    public string To5PartFbn() => $"{Version}.{Qfe}.{BuildFlavor ?? "unknown"}.{Branch}.{Timestamp}";

    public override string ToString() => BuildFlavor != null ? To5PartFbn() : To4PartFQBN();

    [GeneratedRegex(@"^\d+\.\d+\.\w+\.\d+-\d+$", RegexOptions.IgnoreCase)]
    private static partial Regex DiscoverBuildNameRegex();
}
