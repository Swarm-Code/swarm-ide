/**
 * Test file for Git diff visualization
 * This file will be used to test deleted lines
 */

function testFunction() {
    console.log('This is line 1');
    console.log('This is line 2');
    console.log('This is line 3');
    console.log('This is line 4');
    console.log('This is line 5');
    console.log('This is line 6');
    console.log('This is line 7');
    console.log('This is line 8');
    console.log('This is line 9');
    console.log('This is line 10');
}

function anotherFunction() {
    const data = {
        name: 'Test',
        value: 123,
        enabled: true,
        items: ['a', 'b', 'c']
    };

    return data;
}

// This section will be deleted
function willBeDeleted() {
    console.log('This entire function will be removed');
    const temp = 'temporary';
    return temp;
}

module.exports = { testFunction, anotherFunction };
