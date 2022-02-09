const {expectRevert} = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

const DAO = artifacts.require("DAO.sol");
const GovToken = artifacts.require('GovToken.sol');

contract ("DAO", (accounts)=> {
    const SIDE = {SUPPORT:0, REJECT:1};
    const STATUS = {
        UNDECIDED: 0,
        APPROVED: 1,
        REJECTED: 2
    };
    const [account1, account2, account3] = [accounts[0], accounts[1], accounts[2]];
    let dao, govToken;

    beforeEach(async() => {
        govToken = await GovToken.new();
        //Making account1 the deployer and owner of the contract
        dao = await DAO.new(govToken.address, {from: account1});
        //Function to provide govToken balance to the accounts and approve DAO to spend it
        const seedTokenBalance = async(trader) => {
            await govToken.faucet(trader, web3.utils.toWei("5000")),
            await govToken.approve(dao.address, web3.utils.toWei("5000"), {from: trader})
        }
        //Calling the seed token balance function
        await Promise.all([account1, account2, account3]
                                .map(account => seedTokenBalance(account)));
    });

    it("Should deposit govToken and show balance", async()=> {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const shareAcc1 = web3.utils.toBN(await dao.shares(account1));
        const shareAcc2 = web3.utils.toBN(await dao.shares(account2));
        const shareAcc3 = web3.utils.toBN(await dao.shares(account3));
        const totalShares = web3.utils.toBN(await dao.totalShares());
        assert(shareAcc1.toString() === web3.utils.toWei('1000'));
        assert(shareAcc2.toString() === '0');
        assert(shareAcc3.toString() === '0');
        assert(totalShares.toString() === web3.utils.toWei('1000'));
    });

    it("Should withdraw", async()=>{
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        await dao.withdraw(web3.utils.toWei('1000'), {from: account1});
        const shareAcc1 = web3.utils.toBN(await dao.shares(account1));
        const totalShares = web3.utils.toBN(await dao.totalShares());
        const acc1Balance = await govToken.balanceOf(account1);
        assert(shareAcc1.toString() === "0");
        assert(totalShares.toString() === "0");
        assert(acc1Balance.toString() === web3.utils.toWei('5000'));
    });

    it("Should not withdraw if balance is not enough", async() => {
        await expectRevert(
            dao.withdraw(web3.utils.toWei('1000'), {from: account1}),
            "Shares too low"
        );
    });

    it("Should create a proposal", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        const proposal = await dao.proposals(proposalHash);
        assert(proposal.author === account1);
        assert(proposal.votesSUPPORT.toString() === "0");
        assert(proposal.votesREJECT.toString() === "0");
        assert(proposal.status.toString() === "0");    
    });

    it("Should not create a proposal if shares not enough", async()=>{
        await dao.deposit(web3.utils.toWei('50'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await expectRevert( 
            dao.createProposal(proposalHash, {from: account1}),
            "Shares too low to create proposal"
        );
    });

    it("Should not create a proposal if it already exists", async()=>{
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});

        await dao.deposit(web3.utils.toWei('1000'), {from: account2});
        await expectRevert(
            dao.createProposal(proposalHash, {from: account2}),
            "Proposal already exist"
        );
    });

    it("Should let us vote", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        await dao.deposit(web3.utils.toWei('100'), {from: account2});
        await dao.deposit(web3.utils.toWei('10'), {from: account3});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        await dao.vote(SIDE.SUPPORT, proposalHash, {from: account1});
        await dao.vote(SIDE.REJECT, proposalHash, {from: account2});
        await dao.vote(SIDE.REJECT, proposalHash, {from: account3});
        const proposal = await dao.proposals(proposalHash);
        const hasVotedAcc1 = await dao.votes(account1, proposalHash);
        assert(hasVotedAcc1 === true);
        assert(proposal.votesSUPPORT.toString() === web3.utils.toWei('1000'));
        assert(proposal.votesREJECT.toString() === web3.utils.toWei('110'));
        assert(proposal.status.toNumber() === STATUS.APPROVED);
    });

    it("Should not let us vote if proposal doesn't exist", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await expectRevert(
            dao.vote(SIDE.SUPPORT, proposalHash, {from: account1}),
            "Proposal doesn't exist"
        );
    });

    it("Should not let us vote if voting period is over", async()=>{
        //Changing the voting period to 1 second so that we can test easily
        await dao.changeVotingPeriod(1);
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        //Timelocking for 1.5 seconds so that voting period is over
        await new Promise(resolve => setTimeout(resolve, 1500));
        await expectRevert(
            dao.vote(SIDE.SUPPORT, proposalHash, {from: account1}),
            "Voting period over"
        );
    });

    
    it("Should not let us vote if we already voted", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        await dao.vote(SIDE.SUPPORT, proposalHash, {from: account1}),
        await expectRevert(
            dao.vote(SIDE.SUPPORT, proposalHash, {from: account1}),
            "Already voted"
        );
    });
    
    it("Should let us change our vote", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        await dao.vote(SIDE.SUPPORT, proposalHash, {from: account1});
        let proposal = await dao.proposals(proposalHash);
        const prevSupportVotes = proposal.votesSUPPORT;
        const prevRejectVotes = proposal.votesREJECT;
        await dao.changeVote(proposalHash, {from: account1});
        proposal = await dao.proposals(proposalHash);
        const newSupportVotes = proposal.votesSUPPORT;
        const newRejectVotes = proposal.votesREJECT;
        const myVote = await dao.sideOfVote(account1, proposalHash);
        assert(myVote.toNumber() === SIDE.REJECT);
        assert(prevRejectVotes.toString() === '0');
        assert(prevSupportVotes.toString() === web3.utils.toWei('1000'));
        assert(newRejectVotes.toString() === web3.utils.toWei('1000'));
        assert(newSupportVotes.toString() === '0');
    });
    
    it("Should not let change vote if proposal doesn't exist", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await expectRevert(
            dao.changeVote(proposalHash, {from: account1}),
            "Proposal doesn't exist"
        );
    });

    it("Should not let change vote if we haven't already voted", async() => {
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        await expectRevert(
            dao.changeVote(proposalHash, {from: account1}),
            "You haven't even voted till now"
        );
    });

    it("Should not let change vote if voting period is over", async() => {
        //Changing the voting period to 5 second so that we can test easily
        await dao.changeVotingPeriod(5);
        await dao.deposit(web3.utils.toWei('1000'), {from: account1});
        const myProposal = "Should we vote";
        const proposalHash = web3.utils.asciiToHex(myProposal);
        await dao.createProposal(proposalHash, {from: account1});
        await dao.vote(SIDE.SUPPORT, proposalHash, {from: account1});
        //Timelocking for 5.1 seconds so that voting period is over
        await new Promise(resolve => setTimeout(resolve, 5100));
        await expectRevert(
            dao.changeVote(proposalHash, {from: account1}),
            "Voting period over"
        );
    });
    
    it("Should let us change min share to create proposal", async() => {
        const oldMinShare = await dao.minSharesToCreateProposal();
        await dao.changeMinSharesToCreateProposal(1000);
        const newMinShare = await dao.minSharesToCreateProposal();
        assert(oldMinShare.toString() === web3.utils.toWei('100'));
        assert(newMinShare.toString() === web3.utils.toWei('1000'));
    });

    it("Should not let non-owner to change min shares to create proposal", async() => {
        await expectRevert(
            dao.changeMinSharesToCreateProposal(1000, {from: account2}),
            "Only Owner"
        );
    });

    it("Should let owner change voting period", async() => { 
        await dao.changeVotingPeriod(10);
        const newWaitingPeriod = web3.utils.toBN(await dao.votingPeriod());
        assert(newWaitingPeriod.toString() === "10");
    });

    it("Should let change owner", async() => {
        await dao.changeOwner(account2, {from: account1});
        const owner = await dao.owner();
        assert(owner === account2);
    });

    it("Should not let change owner if msg sender is not owner", async() => {
        await expectRevert(
            dao.changeOwner(account2, {from: account3}),
            "Only Owner"
        );
    });
});