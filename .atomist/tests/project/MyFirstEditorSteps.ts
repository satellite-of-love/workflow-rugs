import { Project } from "@atomist/rug/model/Project";
import { Given, When, Then, ProjectScenarioWorld } from "@atomist/rug/test/project/Core";

When("MyFirstEditor inputParameteristhe inputParameter value for MyFirstEditor is added to your project by AddMyFirstEditor", (p, world) => {
    let psworld = world as ProjectScenarioWorld;
    let editor = psworld.editor("MyFirstEditor");

    psworld.editWith(editor, { inputParameter: "the inputParameter value" });
});

Then("fileContains hello txt Hello Worldnot for MyFirstEditor is added to your project by AddMyFirstEditor", (p, world) => {

    return p.fileContains("hello.txt", "Hello, World!");
});
