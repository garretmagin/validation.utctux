using Shouldly;
using utctux.Server.Models;
using Xunit;

namespace utctux.UnitTests.Models;

public class AzureDevOpsUriTests
{
    [Fact]
    public void CreateFromUri_DevAzureCom_ParsesOrgAndProject()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build/results?buildId=123");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.OrganizationName.ShouldBe("myorg");
        result.Project.ShouldBe("myproject");
    }

    [Fact]
    public void CreateFromUri_VisualStudioCom_ParsesOrgAndProject()
    {
        var uri = new Uri("https://myorg.visualstudio.com/myproject/_build/results?buildId=123");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.OrganizationName.ShouldBe("myorg");
        result.Project.ShouldBe("myproject");
    }

    [Fact]
    public void CreateFromUri_ProjectGuid_SetsProjectGuid()
    {
        var guid = Guid.NewGuid();
        var uri = new Uri($"https://dev.azure.com/myorg/{guid}/_build");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.ProjectGuid.ShouldBe(guid);
    }

    [Fact]
    public void CreateFromUri_NonGuidProject_ProjectGuidIsNull()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.ProjectGuid.ShouldBeNull();
    }

    [Fact]
    public void ExtractBuildId_ValidQuery_ReturnsBuildId()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build/results?buildId=12345");
        var buildId = AzureDevOpsUri.ExtractBuildId(uri);

        buildId.ShouldBe(12345);
    }

    [Fact]
    public void ExtractBuildId_NoBuildId_ReturnsNull()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build/results?view=logs");
        var buildId = AzureDevOpsUri.ExtractBuildId(uri);

        buildId.ShouldBeNull();
    }

    [Fact]
    public void ExtractBuildId_NonNumericBuildId_ReturnsNull()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build/results?buildId=abc");
        var buildId = AzureDevOpsUri.ExtractBuildId(uri);

        buildId.ShouldBeNull();
    }

    [Fact]
    public void GenerateBuildUri_ReturnsExpectedFormat()
    {
        var orgUri = new Uri("https://dev.azure.com/myorg/");
        var result = AzureDevOpsUri.GenerateBuildUri(orgUri, "myproject", 42);

        result.ToString().ShouldBe("https://dev.azure.com/myorg/myproject/_build/results?buildId=42");
    }

    [Fact]
    public void GenerateBuildUri_WithJobAndTask_ReturnsExpectedFormat()
    {
        var orgUri = new Uri("https://dev.azure.com/myorg/");
        var jobGuid = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var taskGuid = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var result = AzureDevOpsUri.GenerateBuildUri(orgUri, "myproject", 42, jobGuid, taskGuid);

        result.ToString().ShouldContain("buildId=42");
        result.ToString().ShouldContain("view=logs");
        result.ToString().ShouldContain($"j={jobGuid}");
        result.ToString().ShouldContain($"t={taskGuid}");
    }

    [Fact]
    public void OrganizationUri_ReturnsDevAzureComFormat()
    {
        var uri = new Uri("https://myorg.visualstudio.com/myproject");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.OrganizationUri.ToString().ShouldBe("https://dev.azure.com/myorg/");
    }

    [Fact]
    public void Uri_CombinesOrgAndProject()
    {
        var uri = new Uri("https://dev.azure.com/myorg/myproject/_build");
        var result = AzureDevOpsUri.CreateFromUri(uri);

        result.Uri.ToString().ShouldBe("https://dev.azure.com/myorg/myproject");
    }
}
