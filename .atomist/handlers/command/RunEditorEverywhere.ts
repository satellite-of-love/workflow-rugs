import { HandleCommand, HandlerContext, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { Repo } from '@atomist/cortex/Repo';

/**
 * Run an editor on all our projects.
 * To use this, write an editor that you want to run everywhere.
 * The editor should detect when the project it's looking at isn't
 * one it understands, and not make any changes.
 * 
 * The editor must have no parameters.
 * 
 * The editor needs to be in a rug archive listed in this project's
 * dependencies.
 */
@CommandHandler("RunEditorEverywhere", "Run one editor on all repos in satellite-of-love")
@Tags("workflow", "satellite-of-love", "rug")
@Intent("org-wide edit")
export class RunEditorEverywhere implements HandleCommand {

    @Parameter({
        displayName: "rug archive holding this generator",
        description: "workflow-rugs or rest-service-generator",
        pattern: Pattern.project_name,
        validInput: "workflow-rugs or rest-service-generator"
    })
    rugArchive: string;

    @Parameter({
        displayName: "editor name",
        description: "the (parameterless) editor to run, like ChangeMemoryRequirements",
        pattern: Pattern.project_name,
        validInput: "a description of the valid input"
    })
    editorName: string;

    handle(command: HandlerContext): Plan {
        let pxe = command.pathExpressionEngine;
        let plan = new Plan();

        // match (ct: ChatTeam { name: "satellite-of-love" } ) - [:OWNS] - (gh: Org) - [:HAS] - (r: Repo) return r

        pxe.with<Repo>(command.contextRoot, "/orgs::Org()/repo::Repo()", r => {
            plan.add(new ResponseMessage(`Running ${this.editorName} on ${r.name}`))
            plan.add({
                instruction: {
                    kind: "edit", name:
                        {
                            name: this.editorName,
                            group: "satellite-of-love",
                            artifact: this.rugArchive
                        }, project: r.name
                },
                onSuccess: new ResponseMessage("Created PR on " + r.name),
                onError: new ResponseMessage("Failed to edit " + r.name)
            });
        });

        return plan;
    }
}

export const runEditorEverywhere = new RunEditorEverywhere();
