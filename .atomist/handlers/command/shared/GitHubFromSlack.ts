import { HandlerContext } from '@atomist/rug/operations/Handlers';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/stub/GitHubId';
import { Person } from '@atomist/cortex/stub/Person';

export interface Sadness {
    error: string
}

export function githubLoginFromSlackUser(context: HandlerContext, slackUser: string): GitHubId | Sadness {
    let userMatch = context.pathExpressionEngine.evaluate<ChatTeam, GitHubId>(context.contextRoot as ChatTeam,
        `/members::ChatId()[@id='${slackUser}']/person::Person()/gitHubId::GitHubId()`);

    if (userMatch == null) {
        return { error: "null result" }
    }
    let matches = userMatch.matches;
    if (matches.length == 0) {
        return { error: "empty result" }
    }
    if (matches.length == 1) {
        // happy path
        return matches[0];
    }
    if (matches.length > 1) {
        console.log(`Warning: got #{userMatch.matches().length} github logins`)
        let firstLogin = matches[0].login;
        if (matches.every(n => n.login === firstLogin)) {
            console.log("It's OK, they're all the same")
            return matches[0];
        }
        return { error: "Multiple different github logins returned: " + matches.map(f => f.login).join(",") }
    }

}